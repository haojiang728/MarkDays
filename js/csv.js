/* CSV parser follows RFC 4180 quoting rules and retains embedded commas/newlines verbatim. */
(() => {
  "use strict";

  function parseCSV(text) {
    const input = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let quoteClosed = false;

    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"') {
          if (input[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
            quoteClosed = true;
          }
        } else {
          field += character;
        }
      } else if (character === '"' && field.length === 0) {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
        quoteClosed = false;
      } else if (character === "\r" || character === "\n") {
        row.push(field);
        field = "";
        if (row.some(value => value !== "")) rows.push(row);
        row = [];
        quoteClosed = false;
        if (character === "\r" && input[index + 1] === "\n") index += 1;
      } else if (quoteClosed) {
        throw new Error("The CSV contains characters after a closing quote.");
      } else if (character === '"') {
        throw new Error("The CSV contains a quote in an unquoted field.");
      } else {
        field += character;
      }
    }
    if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
    row.push(field);
    if (row.some(value => value !== "")) rows.push(row);
    return rows;
  }

  function escapeField(value) {
    const field = String(value == null ? "" : value);
    return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
  }

  function exportCSV(calendars, localDate) {
    const rows = [["Calendar", "Date", "Symbol", "Note"]];
    const sorted = [...calendars].sort((a, b) => a.name.localeCompare(b.name));
    for (const calendar of sorted) {
      const dates = Object.keys(calendar.marks || {}).sort();
      if (dates.length === 0) {
        rows.push([calendar.name, "", "", ""]);
        continue;
      }
      for (const date of dates) {
        const mark = calendar.marks[date];
        const symbol = window.MarkDaysCalendar.getSymbol(mark);
        const note = typeof mark === "object" && mark ? (mark.note || "") : "";
        rows.push([calendar.name, date, symbol, note]);
      }
    }
    const content = `\uFEFF${rows.map(row => row.map(escapeField).join(",")).join("\r\n")}\r\n`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MarkDays-${localDate}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function validateDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= monthLengths[month - 1];
  }

  function parseImport(text) {
    const rows = parseCSV(text);
    if (rows.length < 1) throw new Error("The file is empty.");
    const now = new Date();
    const today = `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const headers = rows[0].map(header => header.trim().toLowerCase());
    const required = ["calendar", "date", "symbol", "note"];
    const indexes = required.map(header => headers.indexOf(header));
    if (indexes.some(index => index < 0) || new Set(indexes).size !== required.length) {
      throw new Error("CSV must include the columns Calendar, Date, Symbol, and Note.");
    }

    const calendars = new Map();
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (row.length > headers.length && row.slice(headers.length).some(value => value !== "")) {
        throw new Error(`Row ${rowIndex + 1} has more fields than the header.`);
      }
      const values = indexes.map(index => row[index] || "");
      const [name, date, symbol, note] = values;
      if (!name.trim()) throw new Error(`Row ${rowIndex + 1} has an empty calendar name.`);
      if (!calendars.has(name)) calendars.set(name, { id: null, name, createdAt: new Date().toISOString(), marks: {} });
      const calendar = calendars.get(name);
      if (date === "") {
        if (symbol !== "" || note !== "") throw new Error(`Row ${rowIndex + 1} has a symbol or note but no date.`);
        continue;
      }
      if (!validateDateKey(date)) throw new Error(`Row ${rowIndex + 1} has an invalid date. Use a real date in YYYY-MM-DD format.`);
      if (date > today) throw new Error(`Row ${rowIndex + 1} contains a future date. Future days cannot be marked.`);
      if (!symbol) throw new Error(`Row ${rowIndex + 1} is missing a symbol.`);
      if (Object.prototype.hasOwnProperty.call(calendar.marks, date)) {
        throw new Error(`Row ${rowIndex + 1} repeats ${date} for calendar "${name}".`);
      }
      calendar.marks[date] = note ? { symbol, note } : symbol;
    }
    if (calendars.size === 0) throw new Error("The CSV does not contain any calendars.");
    return [...calendars.values()];
  }

  window.MarkDaysCSV = { parseCSV, exportCSV, parseImport };
})();
